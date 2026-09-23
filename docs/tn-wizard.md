# Единая вкладка «Турниры 🏆»: Студия, мастер, поле, шаблоны, управление

**Админ-панель → «Турниры 🏆»** — единая точка входа для всего турнирного цикла.
Вкладка построена на **Студии турниров** (`js/tn-studio.js`, корень
`#tn-studio-root`): общий список ВСЕХ турниров с бейджем источника
(Студия/Мастер/Классика) и карточка турнира из 7 разделов. Мастер (10 шагов),
настройки поля, шаблоны, управление, стартовый лист и быстрый редактор
протокола не живут отдельными вкладками — их корни паркуются в скрытом
контейнере `#tn-embed-parking` и монтируются в хосты Студии (`#tns-host-*`)
по мере открытия разделов, возвращаясь в парковку при уходе. Если какой-то
модуль не загружен, раздел показывает кнопку-заглушку (`typeof`-гарды) —
Студия не падает никогда.

Прямые ссылки (без перезагрузки, состояние в URL-hash, роутер `tnsRouteHash`
с fallback в `tnwRouteHash` мастера):

| Hash | Раздел |
|------|---------|
| `admin.html#new-create` | Мастер создания турнира (10 шагов) |
| `admin.html#course` | Настройки поля (единственное поле клуба) |
| `admin.html#templates` | Шаблоны турниров |
| `admin.html#manage` | Управление турнирами, заявки, роли и протокол |

Раздел «Группы» карточки монтирует классический мастер зачётов из
`js/admin-tournaments.js` (`tnDivisionsEditorHtml` в родной контейнер
`#tn-div-<id>`; кэш `tnTnVals` Студия подставляет из своей подписки):
обрезка гандикапа, умные группы (равные по числу игроков, с учётом обрезки),
инлайн-правки, синхронизация ти/формата в состав. Ниже панели — студийная
секция «Состав зачётов» (кто в каком зачёте + подпись возраста). Без
классического модуля раздел деградирует к встроенной студийной форме.
`js/admin-tournaments.js` подключён в `admin.html` именно как движок этой
панели (в предкэш SW не входит — admin-only, подхватывается рантайм-кэшем);
его собственный список (`#tn-list`) мёртв и безопасно простаивает.

## Управление и финальный протокол v2

`js/tournament-admin.js` добавляет раздел «Управление турнирами» (монтируется в
Студию из парковки), не ломая классическую форму и стартовый лист. Из неё
можно открыть существующий
10-шаговый мастер на редактирование, перевести турнир по lifecycle, клонировать
конфигурацию с/без состава, обработать `applications`/`waitlist`, импортировать
до 500 строк Excel/CSV, назначить роли и просмотреть audit. Записи управления
требуют Firebase Auth-пользователя с `users/<uid>/role == admin`; мастер-пароль
старой страницы не является серверным разрешением.

Финальный протокол строится из `rounds` и `settings/course` без копирования поля.
Администратор создаёт версию `fixed` с hole breakdown, затем публикует её как
`published`. Номер версии, снимок строк, статус DQ/WD/DNS/DNF, actor и время
хранятся в `tournaments/<id>/protocol` и `audit`; опубликованный снимок не
перезаписывается. Публичная страница показывает опубликованный снимок, печатает
PDF через браузер и экспортирует Excel-compatible CSV. Правила доступа и
целевой PostgreSQL/RLS mapping описаны в `docs/tournament-security.md`.

## Файлы

| Файл | Назначение |
|------|-----------|
| `js/tn-engine.js` | **Доменный слой** (без DOM/Firebase, тестируется в Node): справочник `TN_CONFIG`, `HandicapService` (WHS), `ScoringService` (стратегии подсчёта), `TieBreakService`, `PairingService`, `CutService`, `LeaderboardService`, `Exporters` (CSV/JSON/печать) |
| `js/tn-wizard.js` | **UI-слой мастера**: wizard (10 шагов, data-driven), черновики (localStorage + Firebase автосейв каждые 20 с), поле, шаблоны, hash-роутинг; монтируется в Студию из `#tn-embed-parking` |
| `js/tn-studio.js` | **Единая вкладка**: список всех турниров, карточка (7 разделов), монтирование модулей из парковки, hash-роутер, «Подтвердить все» |
| `js/tn-studio-core.js` | Чистая логика Студии (без DOM, тестируется в Node): даты, состав, CH/стейблфорд, зачёты, legacy-синхронизация `formats[]/tees[]` |
| `js/admin-tournaments.js` | Классический мастер зачётов (движок панели «Группы» в Студии): обрезка HCP, умные группы, инлайн-правки |
| `css/tn-wizard.css` | Стили мастера и Студии (наследуют дизайн-систему `style.css`: CSS-переменные, тёмная тема) |
| `tools/test-tn-engine.js` | 76 автотестов движка (`node tools/test-tn-engine.js`) |
| `tools/test-tn-wizard-ui.js` | 69 UI-проверок мастера в jsdom (`NODE_PATH=… node tools/test-tn-wizard-ui.js`) |
| `tools/test-tn-studio.js` | 46 тестов ядра Студии (`node tools/test-tn-studio.js`) |
| `tools/test-tn-studio-unified.js` | 35 UI-проверок единой вкладки в jsdom (список, бейджи, монтирование, роутер, панель зачётов) |

В `js/admin.js` добавлен один вызов `tnwOnAdminOpen()` при входе в админку;
в `js/utils.js` — `tnwOnLangChange()` при смене языка (оба вызова защищены
`typeof … === 'function'`, без новых зависимостей).

## Архитектура данных (Firebase RTDB)

```
settings/
└── course/                      ← «Настройки поля» (ОДНО поле клуба)
    ├── name, logoUrl, address, lat, lng
    ├── type: 9|18|27|36
    ├── holes: [ { num, par: 3|4|5, si: 1..N (уникальный),
    │              yards: { bk, bl, wh, ye, rd } } ]
    ├── ratings: { bk|bl|wh|ye|rd: { cr, slope } }     ← Course/Slope Rating (WHS)
    ├── localRules, difficultyNote, mapUrl
    ├── holeSponsors: { "1": "Фирма", … }              ← холь-спонсоры
    └── updatedAt, updatedBy

tnDrafts/<uid|master>/<draftId>  ← черновики мастера (автосейв 20 с)
    ├── config: { info, format, scoring, participants, flights,
    │             officials, prizes, media, publish }  ← 10 шагов
    ├── step, name, status, scheduledAt, owner, updatedAt

tnTemplates/<tplId>              ← «Шаблоны турниров»
    ├── name, type, typeId
    ├── config: <как у черновика, БЕЗ дат и участников>
    └── authorUid, authorName, createdAt, updatedAt

tournaments/<tnId>               ← публикация (ЧИТАЕТСЯ существующим кодом)
    ├── name, date, formats[], tees[], status: 'upcoming'   ← legacy-поля
    ├── nameEn, description, logo, banner, slug, isPublic
    ├── endDate, roundsMeta[], categories[], level, typeId
    ├── fromWizard: true, wizardVersion: 2
    ├── courseRef: 'settings/course'           ← поле не дублируется
    ├── wizard: <полная конфигурация 10 шагов>
    └── audit/<pushId>: { event: 'published', at, by, draftKey }
```

ER-связи:

```
settings/course ──┐ (courseRef, 1 field → N tournaments)
                  ▼
tnTemplates ──create-from──► tnDrafts ──publish──► tournaments ──► (сущ. механизмы:
   (шаблоны)                 (черновики)            │                divisions,
                                                    └── audit ◄── every publish  waitlist, groups,
                                                                                   scoring, leaderboard)
```

## Права

- Доступ к вкладкам = доступ к админ-панели (`hasAdminPanelAccess()`).
- Сохранение поля, публикация — только администратору (повторная проверка в UI;
  правила RTDB — см. ниже).
- Все значимые события пишутся в `tournaments/<id>/audit`.

Рекомендуемые правила RTDB (добавить в правила базы):

```json
{
  "rules": {
    "settings": { "course": { ".read": true,  ".write": "root.child('users/'+auth.uid+'/role').val() === 'admin'" } },
    "tnTemplates": { ".read": "auth != null", ".write": "root.child('users/'+auth.uid+'/role').val() === 'admin'" },
    "tnDrafts":  { "$uid": { ".read": "auth != null", ".write": "auth != null" } }
  }
}
```

## Мастер: как устроен

10 шагов описаны **декларативно** в `tnwSteps()` (`js/tn-wizard.js`): шаг =
список групп, группа = список полей. Типы полей: `text/textarea/date/time/
datetime/number/url/select/multi/bool/list/pointsTable/tieOrder/notifyTemplates`.
Рендер, двусторонняя привязка (`data-tnw-path` → `draft`, делегированный
`input/change`), динамические списки и drag&drop — общие для всех шагов.

Автосохранение: `localStorage` — мгновенно на каждый ввод; Firebase
(`tnDrafts/<owner>/<key>`) — каждые 20 с при наличии изменений и по `Ctrl+S`.
Черновик можно закрыть и продолжить с лендинга мастера (список черновиков).
**Отложенная публикация**: черновик со статусом `scheduled` и прошедшим
`scheduledAt` автоматически публикуется, когда админ открывает панель
(`tnwCheckScheduled`).

Горячие клавиши: `Ctrl/Cmd+S` — сохранить черновик на сервере.

## Движок (`js/tn-engine.js`)

- **WHS**: `CH = HI × (Slope/113) + (CR − Par)`, `PH = CH × Allowance%`,
  cap применяется к индексу; удары форы — по stroke index (плюсовые гандикапы
  отдают удары с лунок с наибольшим SI); командный гандикап скрембла —
  взвешенный (25/20/15/10%).
- **Stableford/Modified** — редактируемые таблицы очков (0–5+ / −3…+8),
  ключи: `lte-4, -3, -2, -1, 0, +1, gte+2`.
- **Net Double Bogey** — потолок на лунке: `par + 2 + удары форы`.
- **Match Play** (учёт «X&Y»), **Skins** с carry-over, **Best Ball**, **Scramble**.
- **Тай-брейки**: countback (9/6/3/1), по последней лунке, по stroke index,
  sudden death (маркер плей-офф); порядок методов = приоритет.
- **Флайты**: по гандикапу/рейтингу/возрасту/полу/случайно (детерминированный
  ГПСЧ по seed); группы по 2/3/4; расписания shotgun / tee times / two-tee;
  re-pairing по лидерборду (лидеры — последней группой).
- **Cut**: top-N с учётом ties или строго.
- **Лидерборд**: позиции с делёжем мест, R1–R4, Total, Thru, Today, Gross/Net/
  очки, проекция; цветовые классы eagle/birdie/par/bogey/double.
- **Печать** (брендированная, кнопка «Печать»): scorecard (пар, SI, ярдажи по
  ти, точки форы, подписи маркера/игрока), tee times, лидерборд, дипломы
  (массово). **Экспорт**: CSV (BOM, экранирование) и JSON.

## Как расширять

### Добавить систему подсчёта
1. В `TN_CONFIG.scoringSystems` добавьте `{ id: 'my-system', nameRu, nameEn }`.
2. В `ScoringService.STRATEGIES` — объект `{ direction: 'low'|'high', unit, aggregate(holes) }`.
3. При необходимости — маппинг в legacy-формат в `tnwLegacyFormats()`.
4. Тест в `tools/test-tn-engine.js`. Всё: система появится в шаге 3, сводке и сортировках автоматически.

### Добавить шаг/поле в мастер
Поле — это запись в `tnwSteps()` (группа + дескриптор). Новый шаг — новый
объект в массиве + условие «шаг выполнен» в `tnwStepDone()` + строка в сводке
`tnwSummaryHtml()`. Привязка к черновику, автосейв и валидация уже работают.

### Добавить тай-брейк
Запись в `TN_CONFIG.tieBreaks` + функция `(aScores, bScores) → -1/0/1` в
`TieBreakService.METHODS`. Дальше доступен в шаге 3 с сортировкой приоритета.

### Добавить номинацию
Запись в `TN_CONFIG.nominations` (`needsHoles: true`, если номинация привязана
к лунке — тогда она доступна и в таблице лунок-номинаций шага 7).

### Добавить печатный шаблон
Метод в `Exporters` (`js/tn-engine.js`), собирающий body и возвращающий
`Exporters._printShell(title, brand, body)`; вывод — `tnwPrintHtml(html)`.

## Проверка

```bash
node tools/test-tn-engine.js                                               # движок (76)
node tools/test-tn-studio.js                                               # ядро Студии (46)
NODE_PATH=$(pwd)/../nmtest/node_modules node tools/test-tn-wizard-ui.js    # UI мастера (69)
NODE_PATH=$(pwd)/../nmtest/node_modules node tools/test-tn-studio-unified.js  # UI единой вкладки (35)
```

Демо-поле «Пестово» (18 лунок, пар 72): вкладка «Настройки поля» →
«Заполнить демо» → «Сохранить поле».
